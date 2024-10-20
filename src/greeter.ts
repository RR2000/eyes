// Use the built-in WebSocket API
const ws = new WebSocket('ws://localhost:9090');

ws.onopen = () => {
    console.log('Connection is opened for the Client!');
    document.body.textContent = greeter(user);
};

ws.onmessage = (event) => {
    console.log('Received message from the server: ' + event.data);
};

function greeter(person: string) {
    ws.send('Hello from ' + person);
    console.log('Message sent');
    return "Hello " + person;
}

let user = "Pippo";

