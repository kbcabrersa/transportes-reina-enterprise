const CORREO_ADMIN = "brayac64@gmail.com";
const CLAVE_ADMIN = "Admin1";

document.getElementById("loginEnterprise").addEventListener("submit", e => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value.trim();
    const mensaje = document.getElementById("loginMensaje");

    if(email === CORREO_ADMIN && password === CLAVE_ADMIN){
        localStorage.setItem("enterpriseAuth", "true");
        localStorage.setItem("enterpriseUser", email);
        window.location.href = "dashboard-enterprise.html";
    }else{
        mensaje.textContent = "Correo o clave incorrectos.";
        mensaje.style.color = "red";
    }
});
