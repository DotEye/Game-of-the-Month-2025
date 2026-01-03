import {setOverlay} from './dom.ts';

export function next() {
    setOverlay(`
        <div style="display: flex; flex-direction: column; gap: 25px; justify-content: center; height: calc(100% - 50px); padding: 25px; background-color: var(--ui-black)">
            <h1>Thank you so much for playing my games this year.</h1>
            <p>This has been a ton of fun and an incredible learning experience. I am extremely appreciative of everyone that has taken time out of their day to play.</p>
            <strong>Will "Game of the Month" continue into 2026?</strong>
            <p>Unfortunately no. It's time to move on to something else.</p>
            <strong>What's next for .i?</strong>
            <p>I'm not sure yet. But if you enjoyed these games, you'll hopefully love what I make next. Click an icon to stay up to date:</p>
            <div class="links" style="max-width: 100%">
                <a class="icon" href="https://discord.gg/tykwEuuYCt" target="_blank">
                    <img width="25" height="25" src="https://doteye.online/assets/social/light/discord.svg" alt="Discord" />
                </a>
                <a class="icon" href="https://www.youtube.com/DotEyeOnline" target="_blank">
                    <img width="25" height="25" src="https://doteye.online/assets/social/light/youtube.svg" alt="YouTube" />
                </a>
                <a class="icon" href="https://www.instagram.com/doteyeonline" target="_blank">
                    <img width="25" height="25" src="https://doteye.online/assets/social/light/instagram.svg" alt="Instagram" />
                </a>
                <a class="icon" href="https://www.tiktok.com/@doteyeonline" target="_blank">
                    <img width="25" height="25" src="https://doteye.online/assets/social/light/tiktok.svg" alt="TikTok" />
                </a>
                <a class="icon" href="https://reddit.com/u/DotEyeOnline" target="_blank">
                    <img width="25" height="25" src="https://doteye.online/assets/social/light/reddit.svg" alt="Reddit" />
                </a>
                <a class="icon" href="https://twitter.com/DotEyeOnline" target="_blank">
                    <img width="25" height="25" src="https://doteye.online/assets/social/light/x.svg" alt="X" />
                </a>
                <a class="icon" href="https://github.com/DotEye" target="_blank">
                    <img width="25" height="25" src="https://doteye.online/assets/social/light/github.svg" alt="GitHub" />
                </a>
            </div>
            <strong>Happy new year!</strong>
        </div>
    `);
    return () => {};
}
