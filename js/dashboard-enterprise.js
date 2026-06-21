if(localStorage.getItem("enterpriseAuth") !== "true"){
    window.location.href = "login-enterprise.html";
}

function cerrarSesion(){
    localStorage.removeItem("enterpriseAuth");
    localStorage.removeItem("enterpriseUser");
    window.location.href = "login-enterprise.html";
}
