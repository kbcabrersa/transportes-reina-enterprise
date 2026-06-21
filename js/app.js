const slides = document.querySelectorAll(".slide");

let index = 0;

setInterval(() => {
    slides[index].classList.remove("active");

    index++;

    if(index >= slides.length){
        index = 0;
    }

    slides[index].classList.add("active");
}, 5000);


// CONTADOR ANIMADO KPI

const contadores = document.querySelectorAll(".impacto-card h3");

function animarContador(elemento){
    const textoFinal = elemento.textContent.trim();

    let numeroFinal = parseInt(textoFinal.replace(/\D/g, ""));

    if(!numeroFinal){
        return;
    }

    let actual = 0;
    let incremento = Math.ceil(numeroFinal / 60);

    const intervalo = setInterval(() => {
        actual += incremento;

        if(actual >= numeroFinal){
            actual = numeroFinal;
            clearInterval(intervalo);
        }

        if(textoFinal.includes("+")){
            elemento.textContent = actual + "+";
        }else if(textoFinal.includes("-")){
            elemento.textContent = "90-" + actual;
        }else{
            elemento.textContent = actual;
        }

    }, 25);
}

let contadoresActivados = false;

window.addEventListener("scroll", () => {
    const impacto = document.querySelector(".impacto");

    if(!impacto || contadoresActivados){
        return;
    }

    const posicion = impacto.getBoundingClientRect().top;

    if(posicion < window.innerHeight - 100){
        contadores.forEach(animarContador);
        contadoresActivados = true;
    }
});
