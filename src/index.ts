import {WebSocketServer, WebSocket} from 'ws';

const wws = new WebSocketServer({port:9090});

console.log("init");

wws.on('connection', (ws: WebSocketServer) => {
    console.log('New client connected!');

    ws.on('message', (message: Buffer) => {
        wws.clients.forEach((client: WebSocket) => {
            client.send(message.toString());
        });     
    });

    ws.on('close', () => {
        console.log('Client disconnected :(');
    });
});
