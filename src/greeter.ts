// Use the built-in WebSocket API
const ws = new WebSocket('wss://raoulrondinella.dev/ws');
const reader = new FileReader();

type Position = {
    x: number;
    y: number;
}

ws.onopen = () => {
    console.log('Connection is opened for the Client!');
};

ws.onmessage = (event) => {
    let message = JSON.parse(event.data);
    let circle = document.getElementById('circle')!!;
    let circleStyle = circle.style;   
    let x:number = message.x;
    let y:number = message.y;
    x = x - (circle.offsetWidth / window.innerWidth / 2);
    y = y - (circle.offsetHeight / window.innerHeight / 2);

    console.log(circleStyle);
    //circleStyle.background-color = 'green';
    circleStyle.top              =  (y * 100) + "%";
    circleStyle.left             =  (x * 100) + "%";
    console.log('Received message from the server: ' + message);
};

function computePosition(raw_x: number, raw_y: number): Position {
    let circle = document.getElementById('circle')!!;
    let circleStyle = circle.style;   
    let  x = raw_x / window.innerWidth;
    let  y = raw_y / window.innerHeight;
    let position: Position = {
        "x": x,
        "y": y
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
    ws.send(position);
});

