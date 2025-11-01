import januaryLogo from './games/january/logo.webp';
import februaryLogo from './games/february/logo.webp';
import marchLogo from './games/march/logo.webp';
import aprilLogo from './games/april/logo.png';
import mayLogo from './games/may/logo.webp';
import juneLogo from './games/june/logo.webp';
import julyLogo from './games/july/images/logo.webp';
import augustLogo from './games/august/logo.webp';
import septemberLogo from './games/september/logo.webp';
import octoberLogo from './games/october/logo.webp';

const preloaded = [];
function preloadImage(src: string) {
    const image = new Image();
    image.src = src;
    preloaded.push(image);
}

export function preload() {
    preloadImage(januaryLogo);
    preloadImage(februaryLogo);
    preloadImage(marchLogo);
    preloadImage(aprilLogo);
    preloadImage(mayLogo);
    preloadImage(juneLogo);
    preloadImage(julyLogo);
    preloadImage(augustLogo);
    preloadImage(septemberLogo);
    preloadImage(octoberLogo);
}
