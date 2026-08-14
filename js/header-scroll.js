// Hide Header on on scroll down
var didScroll;
var lastScrollTop = 0;
var delta = 5;
var aportarHeight = $('.aportar').outerHeight() * .6;
var historiaHeight = $('.historia').offset();
historiaHeight = historiaHeight.top - $('.historia').outerHeight()*2;

let counterHistoria = false;


console.log('Debe ser mayor a: '+ historiaHeight);

$(window).scroll(function(event){
    didScroll = true;
});

setInterval(function() {
    if (didScroll) {
        hasScrolled();
        didScroll = false;
    }

}, 50);

function hasScrolled() {
    
    var st = $(this).scrollTop();
    // console.log(st);
    
    // // If they scrolled down and are past the navbar, add class .nav-up.
    // // This is necessary so you never see what is "behind" the navbar.
    // if (st > aportarHeight){
    //     // Scroll Down
    //     if ($('#header').hasClass('nav-down')){
    //         // console.log('Entraaaaa')
    //         $('#header').removeClass('nav-down').addClass('nav-up');
    //     }
    // } else {
    //     // Scroll Up
    //     if(st + $(window).height() < $(document).height()) {
    //         if ($('#header').hasClass('nav-up')){
    //             $('#header').removeClass('nav-up').addClass('nav-down');
    //         }
    //     }
    // }


    // This is for programas counter
    if (st >= historiaHeight && counterHistoria == false){
        startCounter();
        counterHistoria = true;
    }
}



// Counter programas

let valueDisplays = document.querySelectorAll(".count-up2");

let t = 500;
let interval = 1;

// El tamaño del incremento es end / t
function startCounter(){
    console.log('Empieza a contar');
    valueDisplays.forEach((valueDisplay) =>{
        let start = 0;
        let end = parseInt(valueDisplay.getAttribute('data-val'));
    
        let step = Math.ceil(end / t);
        console.log(step);
    
        let counter =  setInterval(function(){
            start += Math.ceil(step);
            valueDisplay.textContent = start;
    
            if(start >= end){
                clearInterval(counter);
                valueDisplay.textContent = end;
            }
        }, interval); 
    
    });

}

