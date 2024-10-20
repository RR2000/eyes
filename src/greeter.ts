import {Position} from "./Position";
const ws = new WebSocket('wss://raoulrondinella.dev/ws');
const reader = new FileReader();

let color = "#DDDDDD";
let name = "guest";

ws.onopen = () => {
    console.log('Connection is opened for the Client!');
};

ws.onmessage = (event) => {
    let message: Position = JSON.parse(event.data);

    if(message.name == "guest")
        return;

    console.log(message.name);

    let circle = document.getElementById(message.name!!);

    if(circle === null){
        circle = document.createElement("span");
        circle.setAttribute("id",message.name!!);
        circle.setAttribute("class", "dot");
        document.body.appendChild(circle);
    }

    let circleStyle = circle.style;
    let remainPerc = message.sizePerc!!;

    circleStyle.width = (100 * remainPerc) + "px";
    circleStyle.height = (100 * remainPerc) + "px";

    console.log(Date.now());
    console.log(message.until);
    console.log(remainPerc);

    color = message.color!!;
    name = message.name!!;
    let x:number = message.x;
    let y:number = message.y;
    x = x - (circle.offsetWidth / window.innerWidth / 2);
    y = y - (circle.offsetHeight / window.innerHeight / 2);

    console.log(circleStyle);
    circleStyle.backgroundColor  = color;
    circleStyle.top              = (y * 100) + "%";
    circleStyle.left             = (x * 100) + "%";
    console.log('Received message from the server: ' + JSON.stringify(message));

};

function computePosition(raw_x: number, raw_y: number): Position {
    let  x = raw_x / window.innerWidth;
    let  y = raw_y / window.innerHeight;
    let position: Position = {
        "x": x,
        "y": y,
        "sizePerc": null,
        "name": null,
        "color": null,
        "until": null
    }
    return position;
}

document.addEventListener("touchstart", (event) => {
    event.preventDefault();
    let x = event.touches[0].clientX;
    let y = event.touches[0].clientY;
    let position = JSON.stringify(computePosition(x, y));
    ws.send(position);
}, {passive: false});

document.addEventListener("touchmove", (event) => {
    event.preventDefault();
    let x = event.touches[0].clientX;
    let y = event.touches[0].clientY;
    let position = JSON.stringify(computePosition(x, y));
    ws.send(position);
}, {passive: false});

document.addEventListener("mousemove", (event) => {
    let x = event.clientX;
    let y = event.clientY;
    let position = JSON.stringify(computePosition(x, y));
    console.log(position);
    ws.send(position);
});

