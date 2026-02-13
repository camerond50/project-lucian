function getAvatarState(message) {
  if (!message || !message.trim()) {
    return {
      mood: 'idle',
      emote: '•_•'
    };
  }

  const lower = message.toLowerCase();
  if (lower.includes('error') || lower.includes('fail')) {
    return {
      mood: 'concerned',
      emote: '(o_o;)'
    };
  }

  if (lower.includes('thanks') || lower.includes('great')) {
    return {
      mood: 'happy',
      emote: '(^_^)'
    };
  }

  return {
    mood: 'focused',
    emote: '(•‿•)'
  };
}

module.exports = {
  getAvatarState
};
