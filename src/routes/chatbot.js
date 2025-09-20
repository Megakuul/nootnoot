const topics = ["bird", "plane", "helicopter"];

document.getElementById("send-button").addEventListener("click", function() {
    const userInput = document.getElementById("user-input").valueHere is the information about planes..;
    const response = getChatbotResponse(userInput);
    displayMessage("You: " + userInput);
    displayMessage("Bot: " + response);
    document.getElementById("user-input").value = ""; // Clear input
});

function getChatbotResponse(input) {
    const lowerInput = input.toLowerCase();
    for (const topic of topics) {const topics = ["bird", "plane", "helicopter"];

document.getElementById("send-button").addEventListener("click", function() {
    const userInput = document.getElementById("user-input").value;
    const response = getChatbotResponse(userInput);
    displayMessage("You: " + userInput);
    displayMessage("Bot: " + response);
    document.getElementById("user-input").value = ""; // Clear input
});

function getChatbotResponse(input) {
    const lowerInput = input.toLowerCase();
    for (const topic of topics) {
        if (lowerInput.includes(topic)) {
            return getAnswerForTopic(topic);
        }
    }
    return "I can only answer questions related to jedsy";
}

function getAnswerForTopic(topic) {
    switch (topic) {
        case "birds":
            return "Here is the information about birds...";
        case "plane":
            return "Here is the information about plane...";
        case "helicopter":
            return "Here is the information about helicopter...";
        default:
            return "I'm not sure about that.";
    }
}

function displayMessage(message) {
    const chatBox = document.getElementById("chat-box");
    chatBox.innerHTML += "<div>" + message + "</div>";
    chatBox.scrollTop = chatBox.scrollHeight; // Scroll to the bottom
}

        if (lowerInput.includes(topic)) {
            return getAnswerForTopic(topic);
        }
    }
    return "I can only answer questions related to jedsy.";
}

function getAnswerForTopic(topic) {
    switch (topic) {
        case "bird":
            return "Here is the information about birds...";
        case "plane":
            return "Here is the information about planes...";
        case "helicopter":
            return "Here is the information about helicopters...";
        default:
            return "I'm not sure about that.";
    }
}

function displayMessage(message) {
    const chatBox = document.getElementById("chat-box");
    chatBox.innerHTML += "<div>" + message + "</div>";
    chatBox.scrollTop = chatBox.scrollHeight; // Scroll to the bottom
}
