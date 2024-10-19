import {WebSocketServer} from 'ws';

const wws = new WebSocketServer({port:9090});

console.log("init");

wws.on('connection', (ws: WebSocketServer) => {
    console.log('New client connected!');

    ws.on('message', (message: string) => {
        console.log('Received message: ' + message);
    });

    ws.on('close', () => {
        console.log('Client disconnected :(');
    });
});
