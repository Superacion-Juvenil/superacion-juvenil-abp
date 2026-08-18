function overFlowH(){//Función que deshabilita el overflow/scroll cuando se abre el menu y añade la función de volver a deslizar a nuestro label/menu hamburguesa
    document.body.style.overflow = "hidden";
    document.getElementsByClassName("menu-icon")[0].setAttribute("onclick", "overFlowV()");
}
function overFlowV(){//Función que lo habilita (overflow/scroll) y al reves, agrega la otra función para que cuando se abra el menu se vuelva a poder deslizar
    document.body.style.overflow = "";
    document.getElementsByClassName("menu-icon")[0].setAttribute("onclick", "overFlowH()");
}