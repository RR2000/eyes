// Use the built-in WebSocket API
const ws = new WebSocket('ws://localhost:9090');
const reader = new FileReader();

ws.onopen = () => {
    console.log('Connection is opened for the Client!');
};

ws.onmessage = (event) => {
   let message = event.data;
    console.log('Received message from the server: ' + message);
};


document.addEventListener("mousemove", (event) => {
    let position = JSON.stringify({"x": event.clientX, "y": event.clientY});
    ws.send(position);
});

