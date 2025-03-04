import {Position} from "./Position";
const ws = new WebSocket('wss://raoulrondinella.dev/ws');
const reader = new FileReader();

let name = "guest";

ws.onopen = () => {
    console.log('Connection is opened for the Client!');
};

let square = document.getElementById("square")!!;
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
        square.appendChild(stage);
    }
    let remainPerc = message.sizePerc!!;
    if(remainPerc < 0.001)
        stage.remove();

    let circleStyle = stage.style;
    let x = message.x; //this is a number between 0 and 1
    let y = message.y; //this is a number between 0 and 1

    //square.getBoundingClientRect().width);
    x = x - (stage.offsetWidth / 2) / square.getBoundingClientRect().width;
    y = y - (stage.offsetHeight / 2) / square.getBoundingClientRect().height;

    let xPerc = (x) * 100;
    let yPerc = (y) * 100;
    
    const irisElement = <HTMLElement>stage.getElementsByClassName("iris")[0];

    circleStyle.left = `${xPerc}%`;
    circleStyle.top = `${yPerc}%`;
    if(message.color && irisElement.style.background != message.color){
        irisElement.style.background = message.color;
    }
    stage.style.transform = ('scale(' + remainPerc + ')');

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

