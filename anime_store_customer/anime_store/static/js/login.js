// Password Validation
function validatePassword(password) {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  };

  return {
    isValid: Object.values(requirements).every(req => req),
    requirements: requirements
  };
}

// Update password requirements UI
function updatePasswordRequirements(password) {
  const validation = validatePassword(password);

  // Update requirement indicators
  document.getElementById('req-length').innerHTML =
    validation.requirements.length ? '✓ At least 8 characters' : '✗ At least 8 characters';
  document.getElementById('req-length').style.color =
    validation.requirements.length ? '#10b981' : '#ef4444';

  document.getElementById('req-uppercase').innerHTML =
    validation.requirements.uppercase ? '✓ One uppercase letter' : '✗ One uppercase letter';
  document.getElementById('req-uppercase').style.color =
    validation.requirements.uppercase ? '#10b981' : '#ef4444';

  document.getElementById('req-lowercase').innerHTML =
    validation.requirements.lowercase ? '✓ One lowercase letter' : '✗ One lowercase letter';
  document.getElementById('req-lowercase').style.color =
    validation.requirements.lowercase ? '#10b981' : '#ef4444';

  document.getElementById('req-number').innerHTML =
    validation.requirements.number ? '✓ One number' : '✗ One number';
  document.getElementById('req-number').style.color =
    validation.requirements.number ? '#10b981' : '#ef4444';

  document.getElementById('req-special').innerHTML =
    validation.requirements.special ? '✓ One special character' : '✗ One special character';
  document.getElementById('req-special').style.color =
    validation.requirements.special ? '#10b981' : '#ef4444';

  // Update strength bar
  const strengthBar = document.getElementById('password-strength');
  const strength = Object.values(validation.requirements).filter(r => r).length;

  if (password.length === 0) {
    strengthBar.style.display = 'none';
  } else {
    strengthBar.style.display = 'block';
    strengthBar.style.width = (strength / 5 * 100) + '%';

    if (strength <= 2) {
      strengthBar.style.backgroundColor = '#ef4444';
      strengthBar.textContent = 'Weak';
    } else if (strength <= 4) {
      strengthBar.style.backgroundColor = '#f59e0b';
      strengthBar.textContent = 'Medium';
    } else {
      strengthBar.style.backgroundColor = '#10b981';
      strengthBar.textContent = 'Strong';
    }
  }

  return validation.isValid;
}

// Remember Me Functionality
function loadRememberedCredentials() {
  const rememberedEmail = localStorage.getItem('rememberedEmail');
  const rememberedPassword = localStorage.getItem('rememberedPassword');

  if (rememberedEmail && rememberedPassword) {
    document.getElementById('login-email').value = rememberedEmail;
    document.getElementById('login-password').value = rememberedPassword;
    document.getElementById('remember-me').checked = true;
  }
}

function saveRememberedCredentials(email, password, remember) {
  if (remember) {
    localStorage.setItem('rememberedEmail', email);
    localStorage.setItem('rememberedPassword', password);
  } else {
    localStorage.removeItem('rememberedEmail');
    localStorage.removeItem('rememberedPassword');
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  loadRememberedCredentials();

  // Add password validation listener
  const signupPassword = document.getElementById('signup-password');
  if (signupPassword) {
    signupPassword.addEventListener('input', function() {
      updatePasswordRequirements(this.value);
    });
  }
});

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
        const rememberMe = document.getElementById('remember-me').checked;

        console.log('[Login] Attempting login for:', email);

        // Call Real API
        try {
          const userDiff = await apiLoginUser(email, password);

          // Save credentials if remember me is checked
          saveRememberedCredentials(email, password, rememberMe);

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
        const phone = this.querySelector('input[name="phone"]').value;
        const address = this.querySelector('input[name="address"]').value;

        // Validate password
        const validation = validatePassword(password);
        if (!validation.isValid) {
          alert('Password does not meet all requirements:\n' +
                '- At least 8 characters\n' +
                '- One uppercase letter\n' +
                '- One lowercase letter\n' +
                '- One number\n' +
                '- One special character');
          button.textContent = originalText;
          button.style.pointerEvents = "auto";
          button.style.opacity = "1";
          return;
        }

        console.log('[Register] Registering:', email);

        try {
          await apiRegisterUser(email, password, name, phone, address);

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