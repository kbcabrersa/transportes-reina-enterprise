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
