// Add these functions to your existing app.js

let lastBotMessageId = null;

function submitFeedback(rating) {
    if (!lastBotMessageId) {
        alert('No message to provide feedback for');
        return;
    }

    const comment = prompt('Any additional comments? (Optional)');
    
    fetch('/api/feedback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({
            message_id: lastBotMessageId,
            rating: rating,
            comment: comment
        })
    })
    .then(response => response.json())
    .then(data => {
        alert('Thank you for your feedback!');
        document.getElementById('feedbackSection').style.display = 'none';
    })
    .catch(error => {
        console.error('Error submitting feedback:', error);
        alert('Failed to submit feedback');
    });
}

// Update the sendMessage function to capture the last bot message ID
async function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const userMessage = chatInput.value.trim();
    
    if (!userMessage) return;
    
    // Display user message
    displayMessage('user', userMessage);
    chatInput.value = '';
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ message: userMessage })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Store the bot message ID for feedback
            lastBotMessageId = data.message_id;
            
            // Display bot message
            displayMessage('bot', data.response);
            
            // Show feedback buttons
            document.getElementById('feedbackSection').style.display = 'block';
        } else {
            displayMessage('bot', 'Sorry, I encountered an error. Please try again.');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        displayMessage('bot', 'Sorry, I encountered an error. Please try again.');
    }
}