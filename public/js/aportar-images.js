// Array of background images to preload
const backgroundImages = [
    '../assets/FC4-01.png',
    '../assets/FC1-01.png',
    '../assets/FC2-01.png',
    '../assets/FC3-01.png',
    '../assets/FV1-01.png',
    '../assets/FV3-01.png',
    '../assets/FV2-01.png',
    '../assets/FV4-01.png'
];

// Preload images
function preloadImages(urls, callback) {
    let loadedImages = 0;
    const totalImages = urls.length;

    urls.forEach(url => {
        const img = new Image();
        img.onload = () => {
            loadedImages++;
            if (loadedImages === totalImages) {
                callback();
            }
        };
        img.src = url;
    });
}

let numImages = 2;
let cont = 1;
let carouselInterval;

// Only start carousel after images are loaded
preloadImages(backgroundImages, () => {
    carouselInterval = setInterval(function() {
        console.log('Cambia a la imagen:'+cont);
    
    if ($('#aportar-images').hasClass('aportar-image1')){
        $('#aportar-images').removeClass('aportar-image1').addClass('aportar-image2');
    }else{
        if ($('#aportar-images').hasClass('aportar-image2')){
            $('#aportar-images').removeClass('aportar-image2').addClass('aportar-image3');
        }else{
            if ($('#aportar-images').hasClass('aportar-image3')){
                $('#aportar-images').removeClass('aportar-image3').addClass('aportar-image4');
            }else{
                if ($('#aportar-images').hasClass('aportar-image4')){
                    $('#aportar-images').removeClass('aportar-image4').addClass('aportar-image1');
                }
            }
        }
    }

    cont++;

    if(cont>numImages){
        cont = 1;
    }
    }, 5000);
});