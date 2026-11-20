use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use std::sync::Arc;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum PlayerEvent {
    Play { time: f64 },
    Pause { time: f64 },
    Seek { time: f64 },
    Volume { volume: f32 },
    TrackChanged { track_id: String },
    Ping,
    Pong,
}

#[derive(Clone)]
pub struct WsState {
    pub tx: Arc<broadcast::Sender<PlayerEvent>>,
}

impl WsState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(128);
        Self { tx: Arc::new(tx) }
    }
}

pub async fn handle_ws(
    ws: WebSocketUpgrade,
    state: axum::extract::State<WsState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.0))
}

async fn handle_socket(socket: WebSocket, state: WsState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    // Task forwarding broadcasted events to this WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Task receiving incoming messages from this client and broadcasting to others
    let tx = state.tx.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = receiver.next().await {
            if let Message::Text(text) = message {
                if let Ok(event) = serde_json::from_str::<PlayerEvent>(&text) {
                    let _ = tx.send(event);
                }
            }
        }
    });

    // If either task ends, abort the other
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
