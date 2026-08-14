// Cuenta 0568282243
cuenta = '0568282243'
// Clabe 072580005682822434
clabe = '072580005682822434'


const copyContent = async (type) => {    
try {
    if(type == 'cuenta'){
        await navigator.clipboard.writeText(cuenta);
        console.log(cuenta + ' cuenta copied to clipboard');
        $('#copy-cloud-cuenta').addClass('copy-cloud-visible');
        $('#cuentaNumbers').addClass('cuentaNumbersBold');
    }
    if(type == 'clabe'){
        await navigator.clipboard.writeText(clabe);
        console.log(clabe + ' cuenta copied to clipboard');
        $('#copy-cloud-clabe').addClass('copy-cloud-visible');
        $('#clabeNumbers').addClass('cuentaNumbersBold');
    }
    setTimeout(function() { dissapear(type); }, 5000);

} catch (err) {
    console.error('Failed to copy: ', err);
}

function dissapear(type){

    if(type == 'cuenta'){
        $('#copy-cloud-cuenta').removeClass('copy-cloud-visible');
        $('#cuentaNumbers').removeClass('cuentaNumbersBold');
    }
    if(type == 'clabe'){
        $('#copy-cloud-clabe').removeClass('copy-cloud-visible');
        $('#clabeNumbers').removeClass('cuentaNumbersBold');
    }

}


}