const signUpButton = document.getElementById("signUp");
const signInButton = document.getElementById("signIn");
const container = document.getElementById("container");
const goku = document.getElementById("goku");
const eren = document.getElementById("eren");
const gokuSprite = goku.querySelector(".character-sprite");
const erenSprite = eren.querySelector(".character-sprite");

let isAnimating = false;

// Goku animation - comes from the RIGHT
signUpButton.addEventListener("click", () => {
  if (isAnimating) return;
  isAnimating = true;

  gokuSprite.classList.add("walking");

  const walkInterval = setInterval(() => {
    const currentRight = parseInt(goku.style.right || "-200");
    if (currentRight < window.innerWidth / 2 - 325 - 150) {
      goku.style.right = currentRight + 10 + "px";
    } else {
      clearInterval(walkInterval);
      gokuSprite.classList.remove("walking");

      container.classList.add("shake-animation");

      setTimeout(() => {
        container.classList.add("right-panel-active");
        container.classList.remove("shake-animation");

        setTimeout(() => {
          gokuSprite.classList.add("walking");
          const returnInterval = setInterval(() => {
            const currentRight = parseInt(goku.style.right);
            if (currentRight > -200) {
              goku.style.right = currentRight - 10 + "px";
            } else {
              clearInterval(returnInterval);
              gokuSprite.classList.remove("walking");
              isAnimating = false;
            }
          }, 20);
        }, 200);
      }, 200);
    }
  }, 20);
});

// Eren animation - comes from the LEFT
signInButton.addEventListener("click", () => {
  if (isAnimating) return;
  isAnimating = true;

  erenSprite.classList.add("walking");

  const walkInterval = setInterval(() => {
    const currentLeft = parseInt(eren.style.left || "-200");
    if (currentLeft < window.innerWidth / 2 - 325 - 150) {
      eren.style.left = currentLeft + 10 + "px";
    } else {
      clearInterval(walkInterval);
      erenSprite.classList.remove("walking");

      container.classList.add("shake-animation");

      setTimeout(() => {
        container.classList.remove("right-panel-active");
        container.classList.remove("shake-animation");

        setTimeout(() => {
          erenSprite.classList.add("walking");
          const returnInterval = setInterval(() => {
            const currentLeft = parseInt(eren.style.left);
            if (currentLeft > -200) {
              eren.style.left = currentLeft - 10 + "px";
            } else {
              clearInterval(returnInterval);
              erenSprite.classList.remove("walking");
              isAnimating = false;
            }
          }, 20);
        }, 200);
      }, 200);
    }
  }, 20);
});

// Enhanced input focus effects with red highlight
const inputs = document.querySelectorAll("input");

inputs.forEach((input) => {
  input.addEventListener("focus", function () {
    this.parentElement.classList.add("input-focused");
  });

  input.addEventListener("blur", function () {
    if (this.value === "") {
      this.parentElement.classList.remove("input-focused");
    }
  });
});

// Form submit with loading state and actual API call
const forms = document.querySelectorAll("form");

forms.forEach((form) => {
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    // Determine if this is login or register
    const isLogin = this.getAttribute('action') === '/login';
    const button = this.querySelector('button[type="submit"]');
    const originalText = button.textContent;

    // Set loading state
    button.textContent = "LOADING...";
    button.style.pointerEvents = "none";
    button.style.opacity = "0.7";

    try {
      if (isLogin) {
        // Handle Login
        const email = this.querySelector('input[name="username"]').value;
        const password = this.querySelector('input[name="password"]').value;

        console.log('[Login] Attempting login for:', email);

        // Call Real API
        try {
          const userDiff = await apiLoginUser(email, password);

          // Store session
          sessionStorage.setItem('authToken', userDiff.authToken);
          sessionStorage.setItem('userType', userDiff.userType);
          sessionStorage.setItem('role', userDiff.role);
          sessionStorage.setItem('accountId', userDiff.accountId);

          console.log('[Login] Success:', userDiff);

          // Redirect based on role
          setTimeout(() => {
            if (userDiff.userType === 'CUSTOMER') {
              window.location.href = 'home.html';
            } else if (userDiff.userType === 'STAFF') {
              window.location.href = 'manager-dashboard.html';
            }

            button.textContent = originalText;
            button.style.pointerEvents = "auto";
            button.style.opacity = "1";
          }, 1000);

        } catch (error) {
          console.error('Login Failed:', error);
          alert('Login Failed: ' + error.message);
          button.textContent = originalText;
          button.style.pointerEvents = "auto";
          button.style.opacity = "1";
        }

      } else {
        // Handle Register
        const name = this.querySelector('input[name="name"]').value;
        const email = this.querySelector('input[name="email"]').value;
        const password = this.querySelector('input[name="password"]').value;

        console.log('[Register] Registering:', email);

        try {
          await apiRegisterUser(email, password, name);

          setTimeout(() => {
            alert('Registration successful! Please sign in.');
            // Trigger switch to sign in panel
            signInButton.click();

            button.textContent = originalText;
            button.style.pointerEvents = "auto";
            button.style.opacity = "1";
          }, 1000);

        } catch (error) {
          console.error('Registration Failed:', error);
          alert('Registration Failed: ' + error.message);
          button.textContent = originalText;
          button.style.pointerEvents = "auto";
          button.style.opacity = "1";
        }
      }

    } catch (error) {
      console.error('Auth Error:', error);
      alert('Authentication failed: ' + error.message);
      button.textContent = originalText;
      button.style.pointerEvents = "auto";
      button.style.opacity = "1";
    }
  });
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  });
});

// Password visibility toggle (optional enhancement)
function addPasswordToggle() {
  const passwordInputs = document.querySelectorAll('input[type="password"]');

  passwordInputs.forEach(input => {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
  });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  // Add subtle parallax effect to background
  document.addEventListener('mousemove', (e) => {
    const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
    const moveY = (e.clientY - window.innerHeight / 2) * 0.01;

    const bgImage = document.querySelector('.background-image');
    if (bgImage) {
      bgImage.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.05)`;
    }
  });
});