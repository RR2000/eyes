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

let lastPosition = new Map<string, Position>();
let wsMap = new Map<string, WebSocket>();
const maxTime = 60 * 1000;

function updatePositions(name: string) {
    for (let [key, value] of lastPosition) {
        value.sizePerc = (value.until!! - Date.now()) / maxTime;
        if (value.sizePerc < 0) {
            lastPosition.delete(key);
            continue;
        }
        if(wsMap.has(key))
            value.sizePerc = 1;

        for (let ws of wsMap.values()) {
            ws.send(JSON.stringify(value));
        }
    }
}

wws.on('connection', (ws: WebSocket) => {
    console.log('New client connected!');
    let randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    let randomName = generateString(10);
    wsMap.set(randomName, ws);
    ws.on('message', (message: Buffer) => {
        let pos: Position = JSON.parse(message.toString());
        pos.color = randomColor;
        pos.name = randomName;
        pos.sizePerc = 1;
        pos.until = Date.now() + maxTime;
        wws.clients.forEach((client: WebSocket) => {
            lastPosition.set(pos.name!!,pos);
            client.send(JSON.stringify(pos));
        });

    });

    updatePositions(randomName);
    const intervalId = setInterval(() => updatePositions(randomName), 200);

    console.log("Open triggered");
    ws.on('close', () => {
        //todo, send last position with 100% size
        wsMap.delete(randomName);
        console.log('Client disconnected :(');
    });
});
