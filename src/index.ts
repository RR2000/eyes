import {WebSocketServer, WebSocket} from 'ws';
import {Position} from './Position';

const wws = new WebSocketServer({port:9090});

const characters ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateString(length: number): string {
    let result = ' ';
    const charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
}

console.log("init");

wws.on('connection', (ws: WebSocketServer) => {
    console.log('New client connected!');
    let randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    let randomName = generateString(10); 
    ws.on('message', (message: Buffer) => {
        let pos: Position = JSON.parse(message.toString());
        pos.color = randomColor;
        pos.name = randomName;
        wws.clients.forEach((client: WebSocket) => {
            console.log(JSON.stringify(pos));
            client.send(JSON.stringify(pos));
        });     
    });

    ws.on('close', () => {
        console.log('Client disconnected :(');
    });
});
