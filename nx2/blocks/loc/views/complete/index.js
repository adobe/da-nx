/**
https://github.com/matteobruni/tsparticles
https://particles.js.org
https://confetti.js.org
*/
export default function makeConfetti() {
  const duration = 5000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 20, zIndex: 0 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    const particleCount = 40 * (timeLeft / duration);

    // since particles fall down, start a bit higher than random
    window.confetti(
      {
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      },
    );
    window.confetti(
      {
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      },
    );

    if (timeLeft <= 0) {
      clearInterval(interval);
    }
  }, 250);
}
