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
let npObjects = new Map<string, Position>();
const maxTime = 60 * 1000;
const ping = 5;

let speed = 0.005; //percentual per seconds
let speedPerPing = 0.05 / (1000 / ping)

npObjects.set("ball", {
    "name": "ball",
    "x": 0.5,
    "y": 0.5,
    "sent": Date.now(),
    "color": "black",
    "sizePerc": 1,
    "until": 0
});

function updatePositions() {
    for (let [key, value] of npObjects) {
        for (let ws of wsMap.values()) {
            value.x = (value.x + speedPerPing) % 1;
            ws.send(JSON.stringify(value));
        }
    }

    for (let [key, value] of lastPosition) {
        value.sizePerc = (value.until!! - Date.now()) / maxTime;
        if (value.sizePerc < 0) {
            lastPosition.delete(key);
            continue;
        }
        if(wsMap.has(key))
            value.sizePerc = 1;
        for(let [key, extObj] of npObjects){
            if(isColliding(value, extObj)){
                value.color = 'red';  
            }
        }
 
        for (let ws of wsMap.values()) {
            ws.send(JSON.stringify(value));
        }

   }
}

setInterval(() => updatePositions(), ping);

function isColliding(pos1: Position, pos2: Position): boolean {
    let x1 = pos1.x;
    let y1 = pos1.y;

    let x2 = pos2.x;
    let y2 = pos2.y;

    let distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    
    return distance <= 0.075;
}

wws.on('connection', (ws: WebSocket) => {
    console.log('New client connected!');
    let randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    let randomName = generateString(10);
    wsMap.set(randomName, ws);
    ws.on('message', (message: Buffer) => {
        let pos: Position = JSON.parse(message.toString());
        pos.sent = Date.now();

        const lastPos = lastPosition.get(randomName);

        if (lastPos?.sent !== undefined && pos.sent <= lastPos.sent + ping) {
            return;
        }

        pos.color = randomColor;
        pos.name = randomName;
        pos.sizePerc = 1;
        pos.until = Date.now() + maxTime;
        wws.clients.forEach((client: WebSocket) => {
            lastPosition.set(pos.name!!,pos);
            client.send(JSON.stringify(pos));
        });

    });

    console.log("Open triggered");
    ws.on('close', () => {
        //todo, send last position with 100% size
        wsMap.delete(randomName);
        console.log('Client disconnected :(');
    });
});
