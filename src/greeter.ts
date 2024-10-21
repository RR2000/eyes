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

    //oonsole.log(message.name);

    let stage = document.getElementById(message.name!!);
    if(stage === null){
        stage = document.createElement("section");
        stage.setAttribute("id",message.name!!);
        stage.setAttribute("class", "stage");
        let figure = document.createElement("figure");
        figure.setAttribute("class", "ball");
        let iris = document.createElement("span");
        iris.setAttribute("class", "iris");
        let shadow = document.createElement("span");
        shadow.setAttribute("class", "shadow");

        figure.appendChild(shadow);
        figure.appendChild(iris);
        stage.appendChild(figure);
        document.body.appendChild(stage);
    }

    let circleStyle = stage.style;
    let remainPerc = message.sizePerc!!;
    let x = message.x; //this is a number between 0 and 1
    let y = message.y; //this is a number between 0 and 1

    x = x - (stage.offsetWidth / 2)/ window.innerWidth;
    y = y - (stage.offsetHeight / 2) / window.innerHeight;

    let xPerc = (x) * 100;
    let yPerc = (y) * 100;
    
    const ballElement = <HTMLElement>stage.getElementsByClassName("ball")[0];

    circleStyle.left = `${xPerc}%`;
    circleStyle.top = `${yPerc}%`;
    color = message.color!!;
    if(ballElement.style.backgroundColor != color){
        console.log("changed color from:\"" + ballElement.style.backgroundColor + "\" to \"" + color + "\"" );
        ballElement.style.backgroundColor = color;
   }
    name = message.name!!;
};

function computePosition(raw_x: number, raw_y: number): Position {
    let x = raw_x / window.innerWidth;
    let y = raw_y / window.innerHeight;
    let now = Date.now();
    let position: Position = {
        "sent": now,
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
    //console.log(position);
    ws.send(position);
});

