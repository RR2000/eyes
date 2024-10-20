// Use the built-in WebSocket API
const ws = new WebSocket('ws://localhost:9090');
const reader = new FileReader();

ws.onopen = () => {
    console.log('Connection is opened for the Client!');
};

ws.onmessage = (event) => {
    let message = JSON.parse(event.data);
    let circle = document.getElementById('circle')!!;
    let circleStyle = circle.style;   
    let x:number = message.x - circle.offsetWidth  / 2;
    let y:number = message.y - circle.offsetHeight / 2;

    console.log(circleStyle);
    circleStyle.color = 'green';
    circleStyle.top   =  y + "px";
    circleStyle.left  =  x + "px";
    console.log('Received message from the server: ' + message);
};


document.addEventListener("mousemove", (event) => {
    let position = JSON.stringify({"x": event.clientX, "y": event.clientY});
    ws.send(position);
});

