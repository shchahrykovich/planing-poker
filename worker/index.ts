// Planning Poker Worker with Durable Objects

interface Env {
	ROOMS: DurableObjectNamespace;
	GITHUB_URL: string;
	ALLOW_CONNECTION_FROM_CF_ZERO_TRUST_TEAM?: string;
}

// Cloudflare Access identity types
interface CloudflareGroup {
	id: string;
	name: string;
}

interface CloudflareIdentity {
	id: string;
	name: string;
	email: string;
	groups: CloudflareGroup[];
}

// Message types for WebSocket communication
type ClientMessage =
	| { type: "join"; name: string }
	| { type: "vote"; card: string | null }
	| { type: "reveal" }
	| { type: "reset" }
	| { type: "emoji"; targetUserId: string; emoji: string };

type ServerMessage =
	| { type: "joined"; userId: string; name: string }
	| { type: "userJoined"; userId: string; name: string }
	| { type: "userLeft"; userId: string }
	| { type: "voted"; userId: string; hasVoted: boolean }
	| { type: "revealed"; votes: Record<string, string | null> }
	| { type: "reset" }
	| { type: "state"; users: Array<{ id: string; name: string; hasVoted: boolean }>; revealed: boolean; votes?: Record<string, string | null> }
	| { type: "emoji"; fromUserId: string; toUserId: string; emoji: string }
	| { type: "error"; message: string };

interface SessionData {
	userId: string;
	name: string;
	vote: string | null;
	webSocket: WebSocket;
}

// Helper function to get CF_Authorization cookie from request
function getCFAuthorizationCookie(request: Request): string | null {
	const cookieHeader = request.headers.get("Cookie");
	if (!cookieHeader) {
		return null;
	}

	const cookies = cookieHeader.split(";").map((c) => c.trim());
	for (const cookie of cookies) {
		const [name, value] = cookie.split("=");
		if (name === "CF_Authorization") {
			return value;
		}
	}

	return null;
}

// Helper function to get user identity from Cloudflare Access
async function getCloudflareAccessUserInfo(request: Request, teamName: string): Promise<CloudflareIdentity | null> {
	try {
		const cfAuthToken = getCFAuthorizationCookie(request);
		if (!cfAuthToken) {
			return null;
		}

		const identityUrl = `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/get-identity`;
		const response = await fetch(identityUrl, {
			headers: {
				Cookie: `CF_Authorization=${cfAuthToken}`,
			},
		});

		if (!response.ok) {
			return null;
		}

		const identity = (await response.json()) as CloudflareIdentity;
		return identity;
	} catch (err) {
		console.error("Error fetching user identity from Cloudflare Access:", err);
		return null;
	}
}

// Helper function to verify Cloudflare Zero Trust authentication
async function verifyCloudflareAccess(request: Request, teamName: string): Promise<boolean> {
	try {
		const identity = await getCloudflareAccessUserInfo(request, teamName);
		return identity !== null;
	} catch (err) {
		console.error("Error verifying Cloudflare Access:", err);
		return false;
	}
}

// Helper function to handle errors
async function handleErrors(request: Request, func: () => Promise<Response>): Promise<Response> {
	try {
		return await func();
	} catch (err) {
		if (request.headers.get("Upgrade") === "websocket") {
			const pair = new WebSocketPair();
			pair[1].accept();
			pair[1].send(JSON.stringify({ type: "error", message: (err as Error).stack }));
			pair[1].close(1011, "Uncaught exception during session setup");
			return new Response(null, { status: 101, webSocket: pair[0] });
		} else {
			return new Response((err as Error).stack, { status: 500 });
		}
	}
}

// Main Worker export
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return await handleErrors(request, async () => {
			const url = new URL(request.url);
			const path = url.pathname.slice(1).split("/");

			// Check Cloudflare Zero Trust authentication if enabled
			if (env.ALLOW_CONNECTION_FROM_CF_ZERO_TRUST_TEAM) {
				const isAuthenticated = await verifyCloudflareAccess(request, env.ALLOW_CONNECTION_FROM_CF_ZERO_TRUST_TEAM);
				if (!isAuthenticated) {
					if (request.headers.get("Upgrade") === "websocket") {
						// For WebSocket requests, return WebSocket error
						const pair = new WebSocketPair();
						pair[1].accept();
						pair[1].send(JSON.stringify({ type: "error", message: "Authentication required" }));
						pair[1].close(1008, "Authentication required");
						return new Response(null, { status: 101, webSocket: pair[0] });
					} else {
						return new Response("Authentication required", {
							status: 401,
							headers: {
								"Content-Type": "text/plain",
							}
						});
					}
				}
			}

			// Serve API requests
			if (path[0] === "api") {
				return handleApiRequest(path.slice(1), request, env);
			}

			return new Response("Not found", { status: 404 });
		});
	},
} satisfies ExportedHandler<Env>;

async function handleApiRequest(path: string[], request: Request, env: Env): Promise<Response> {
	switch (path[0]) {
		case "whoami": {
			// Return user info from Cloudflare Access if available
			if (env.ALLOW_CONNECTION_FROM_CF_ZERO_TRUST_TEAM) {
				const identity = await getCloudflareAccessUserInfo(request, env.ALLOW_CONNECTION_FROM_CF_ZERO_TRUST_TEAM);
				if (identity) {
					return new Response(JSON.stringify({
						id: identity.id,
						name: identity.name,
						email: identity.email,
						groups: identity.groups,
						authenticated: true,
					}), {
						headers: {
							"Content-Type": "application/json",
							"Access-Control-Allow-Origin": "*",
						},
					});
				}
			}

			// Return empty result if CF auth is disabled or no token
			return new Response(JSON.stringify({
				id: "",
				name: "",
				email: "",
				groups: [],
				authenticated: false,
			}), {
				headers: {
					"Content-Type": "application/json",
					"Access-Control-Allow-Origin": "*",
				},
			});
		}

		case "room": {
			if (!path[1]) {
				// POST to /api/room creates a new room
				if (request.method === "POST") {
					const id = env.ROOMS.newUniqueId();
					return new Response(JSON.stringify({ roomId: id.toString() }), {
						headers: {
							"Content-Type": "application/json",
							"Access-Control-Allow-Origin": "*",
						},
					});
				}
				return new Response("Method not allowed", { status: 405 });
			}

			// Route to specific room
			const roomName = path[1];
			let id: DurableObjectId;

			try {
				if (roomName.match(/^[0-9a-f]{64}$/)) {
					id = env.ROOMS.idFromString(roomName);
				} else if (roomName.length <= 32) {
					id = env.ROOMS.idFromName(roomName);
				} else {
					return new Response("Room name too long", { status: 400 });
				}

				const roomObject = env.ROOMS.get(id);
				const newUrl = new URL(request.url);
				newUrl.pathname = "/" + path.slice(2).join("/");

				return roomObject.fetch(newUrl, request);
			} catch (err) {
				console.error("Error accessing Durable Object:", err);
				return new Response(JSON.stringify({
					error: "Invalid room ID. Please create a new room."
				}), {
					status: 400,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				});
			}
		}

		default:
			return new Response("Not found", { status: 404 });
	}
}

// PlanningPokerRoom Durable Object
export class PlanningPokerRoom implements DurableObject {
	private state: DurableObjectState;
	private sessions: Map<WebSocket, SessionData>;
	private revealed: boolean;

	constructor(state: DurableObjectState, _env: Env) {
		this.state = state;
		this.sessions = new Map();
		this.revealed = false;

		// Restore existing WebSocket connections from hibernation
		this.state.getWebSockets().forEach((webSocket) => {
			const meta = webSocket.deserializeAttachment() as {
				userId: string;
				name: string;
				vote: string | null;
			};
			this.sessions.set(webSocket, {
				...meta,
				webSocket,
			});
		});
	}

	async fetch(request: Request): Promise<Response> {
		return await handleErrors(request, async () => {
			const url = new URL(request.url);

			switch (url.pathname) {
				case "/websocket": {
					if (request.headers.get("Upgrade") !== "websocket") {
						return new Response("Expected websocket", { status: 400 });
					}

					const pair = new WebSocketPair();
					await this.handleSession(pair[1]);

					return new Response(null, { status: 101, webSocket: pair[0] });
				}

				default:
					return new Response("Not found", { status: 404 });
			}
		});
	}

	async handleSession(webSocket: WebSocket): Promise<void> {
		this.state.acceptWebSocket(webSocket);

		const userId = crypto.randomUUID();
		const sessionData: SessionData = {
			userId,
			name: "",
			vote: null,
			webSocket,
		};

		// Serialize attachment for hibernation support
		webSocket.serializeAttachment({
			userId,
			name: "",
			vote: null,
		});

		this.sessions.set(webSocket, sessionData);
	}

	async webSocketMessage(webSocket: WebSocket, message: string | ArrayBuffer): Promise<void> {
		try {
			const session = this.sessions.get(webSocket);
			if (!session) {
				webSocket.close(1011, "Session not found");
				return;
			}

			const data = JSON.parse(message as string) as ClientMessage;

			switch (data.type) {
				case "join": {
					session.name = data.name.slice(0, 32);
					webSocket.serializeAttachment({
						userId: session.userId,
						name: session.name,
						vote: session.vote,
					});

					// Send current state to the joining user
					const users = Array.from(this.sessions.values())
						.filter((s) => s.name)
						.map((s) => ({
							id: s.userId,
							name: s.name,
							hasVoted: s.vote !== null,
						}));

					const stateMessage: ServerMessage = {
						type: "state",
						users,
						revealed: this.revealed,
						...(this.revealed && {
							votes: Object.fromEntries(
								Array.from(this.sessions.values())
									.filter((s) => s.name)
									.map((s) => [s.userId, s.vote])
							),
						}),
					};

					webSocket.send(JSON.stringify(stateMessage));

					// Notify joining user of their ID
					const joinedMessage: ServerMessage = {
						type: "joined",
						userId: session.userId,
						name: session.name,
					};
					webSocket.send(JSON.stringify(joinedMessage));

					// Broadcast to others that a new user joined
					this.broadcast(
						{
							type: "userJoined",
							userId: session.userId,
							name: session.name,
						},
						webSocket
					);
					break;
				}

				case "vote": {
					if (!session.name) {
						webSocket.send(JSON.stringify({ type: "error", message: "Must join first" }));
						return;
					}

					session.vote = data.card;
					webSocket.serializeAttachment({
						userId: session.userId,
						name: session.name,
						vote: session.vote,
					});

					// Broadcast vote status (but not the actual vote unless revealed)
					this.broadcast({
						type: "voted",
						userId: session.userId,
						hasVoted: session.vote !== null,
					});
					break;
				}

				case "reveal": {
					if (!session.name) {
						webSocket.send(JSON.stringify({ type: "error", message: "Must join first" }));
						return;
					}

					this.revealed = true;

					// Collect all votes
					const votes: Record<string, string | null> = {};
					this.sessions.forEach((s) => {
						if (s.name) {
							votes[s.userId] = s.vote;
						}
					});

					// Broadcast revealed votes to everyone
					this.broadcast({
						type: "revealed",
						votes,
					});
					break;
				}

				case "emoji": {
					if (!session.name) {
						webSocket.send(JSON.stringify({ type: "error", message: "Must join first" }));
						return;
					}

					// Broadcast emoji to all users
					this.broadcast({
						type: "emoji",
						fromUserId: session.userId,
						toUserId: data.targetUserId,
						emoji: data.emoji,
					});
					break;
				}

				case "reset": {
					if (!session.name) {
						webSocket.send(JSON.stringify({ type: "error", message: "Must join first" }));
						return;
					}

					this.revealed = false;

					// Reset all votes
					this.sessions.forEach((s) => {
						s.vote = null;
						s.webSocket.serializeAttachment({
							userId: s.userId,
							name: s.name,
							vote: null,
						});
					});

					// Broadcast reset to everyone
					this.broadcast({
						type: "reset",
					});
					break;
				}
			}
		} catch (err) {
			webSocket.send(
				JSON.stringify({
					type: "error",
					message: (err as Error).message,
				})
			);
		}
	}

	async webSocketClose(webSocket: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
		this.closeOrErrorHandler(webSocket);
	}

	async webSocketError(webSocket: WebSocket, _error: unknown): Promise<void> {
		this.closeOrErrorHandler(webSocket);
	}

	private closeOrErrorHandler(webSocket: WebSocket): void {
		const session = this.sessions.get(webSocket);
		if (session?.name) {
			this.broadcast({
				type: "userLeft",
				userId: session.userId,
			});
		}
		this.sessions.delete(webSocket);
	}

	private broadcast(message: ServerMessage, exclude?: WebSocket): void {
		const messageStr = JSON.stringify(message);
		const quitters: WebSocket[] = [];

		this.sessions.forEach((session, ws) => {
			if (ws === exclude) return;
			if (!session.name) return;

			try {
				ws.send(messageStr);
			} catch (err) {
				quitters.push(ws);
			}
		});

		quitters.forEach((ws) => {
			this.sessions.delete(ws);
		});
	}
}
