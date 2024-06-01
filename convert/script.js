const messageField = document.getElementById('message');
const convertButton = document.getElementById('convertButton');

convertButton.addEventListener('click', async () => {
  const message = messageField.value;

  // Check if message is within character limit
  if (message.length > 56) {
    alert('Message cannot exceed 56 characters!');
    return;
  }

  // Replace message with asterisks for display
  messageField.value = message.replace(/./g, '*');

  // Send message to Discord webhook using fetch API (replace with your actual webhook URL)
  const response = await fetch('https://discord.com/api/webhooks/1246164269284855819/WUA2_pRUH_ysNMaL3bbvGyeKfZsid1G0YRIPdOrGSiMW511yMniIA3b6U-jZ_mE3R9zp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: message
    })
  });

  if (response.ok) {
    alert('Message sent successfully!');
  } else {
    alert('Failed to send message!');
  }

  // Revert message field to original value
  messageField.value = message;
});
