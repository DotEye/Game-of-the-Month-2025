import {defineConfig} from 'vite';
import handlebars from 'vite-plugin-handlebars';
import {resolve} from 'path';

export default defineConfig({
    plugins: [
        handlebars({
            // Define where your partials or templates are located
            partialDirectory: resolve(__dirname, 'partials'),

            // The context function allows dynamic data injection
            context(pagePath) {
                const dataset = {
                    '/index.html': {
                        url: 'https://gotm.doteye.online',
                        name: 'Game of the Month 2025',
                        title: 'Game of the Month 2025',
                        description:
                            'A collection of twelves games created and published throughout 2025. Each game is simple, unique, and has an OST.',
                    },
                    '/landing/wormhole/index.html': {
                        url: 'https://gotm.doteye.online/landing/wormhole',
                        name: 'Wormhole',
                        title: 'Wormhole - GOTM 2025',
                        description:
                            'A variant of Snake where eating one piece of food teleports your head to the other piece of food.',
                        month: 'January',
                        image: '/src/games/january/logo.webp',
                        color: '#30324c',
                    },
                    '/landing/relay/index.html': {
                        url: 'https://gotm.doteye.online/landing/relay',
                        name: 'Relay',
                        title: 'Relay - GOTM 2025',
                        description:
                            'A puzzle game about carefully positioning repeaters and walls to safely send a secret message.',
                        month: 'February',
                        image: '/src/games/february/logo.webp',
                        color: '#0e1c0c',
                    },
                    '/landing/brick-bop/index.html': {
                        url: 'https://gotm.doteye.online/landing/brick-bop',
                        name: 'Brick Bop',
                        title: 'Brick Bop - GOTM 2025',
                        description:
                            'A daily game about carefully positioning blocks, optimizing your score, and making music along the way.',
                        month: 'March',
                        image: '/src/games/march/logo.webp',
                        color: '#eee',
                    },
                    '/landing/kornivore/index.html': {
                        url: 'https://gotm.doteye.online/landing/kornivore',
                        name: 'Kornivore',
                        title: 'Kornivore - GOTM 2025',
                        description: 'A corn maze game where the walls are edible.',
                        month: 'April',
                        image: '/src/games/april/logo.webp',
                        color: '#0a3209',
                    },
                    '/landing/star-squad/index.html': {
                        url: 'https://gotm.doteye.online/landing/star-squad',
                        name: 'Star Squad',
                        title: 'Star Squad - GOTM 2025',
                        description:
                            'A spaced-themed survival game where you hire crewmates to operate different controls on your ship.',
                        month: 'May',
                        image: '/src/games/may/logo.webp',
                        color: '#000000',
                    },
                    '/landing/snailsweeper/index.html': {
                        url: 'https://gotm.doteye.online/landing/snailsweeper',
                        name: 'Snailsweeper',
                        title: 'Snailsweeper - GOTM 2025',
                        description:
                            'A variant of Minesweeper with a snail that chases you, and if it touches you, you die.',
                        month: 'June',
                        image: '/src/games/june/logo.webp',
                        color: '#404040',
                    },
                    '/landing/key-pals/index.html': {
                        url: 'https://gotm.doteye.online/landing/key-pals',
                        name: 'Key Pals',
                        title: 'Key Pals - GOTM 2025',
                        description: 'A co-op word game where players work together to spell a word.',
                        month: 'July',
                        image: '/src/games/july/images/logo.webp',
                        color: '#eee',
                    },
                    '/landing/cascade/index.html': {
                        url: 'https://gotm.doteye.online/landing/cascade',
                        name: 'Cascade',
                        title: 'Cascade - GOTM 2025',
                        description:
                            'A domino toppling puzzle game that challenges you to find the correct order and timings for each topple.',
                        month: 'August',
                        image: '/src/games/august/logo.webp',
                        color: '#282c34',
                    },
                    '/landing/drawn-together/index.html': {
                        url: 'https://gotm.doteye.online/landing/drawn-together',
                        name: 'Drawn Together',
                        title: 'Drawn Together - GOTM 2025',
                        description: 'An optimization game about magnets, painting, and extreme precision.',
                        month: 'September',
                        image: '/src/games/september/logo.webp',
                        color: 'white',
                    },
                    '/landing/the-beans-gambit/index.html': {
                        url: 'https://gotm.doteye.online/landing/the-beans-gambit',
                        name: 'The Beans Gambit',
                        title: 'The Beans Gambit - GOTM 2025',
                        description: 'A chess puzzle game where you control made-up pieces.',
                        month: 'October',
                        image: '/src/games/october/logo.webp',
                        color: '#c5b0ff',
                    },
                    '/landing/make-and-break/index.html': {
                        url: 'https://gotm.doteye.online/landing/make-and-break',
                        name: 'Make and Break',
                        title: 'Make and Break - GOTM 2025',
                        description: 'A daily block dropping game where you build your own pieces.',
                        month: 'November',
                        image: '/src/games/november/logo.webp',
                        color: '#1d1d1d',
                    },
                    '/landing/groovy-keys/index.html': {
                        url: 'https://gotm.doteye.online/landing/groovy-keys',
                        name: 'Groovy Keys',
                        title: 'Groovy Keys - GOTM 2025',
                        description:
                            "A rhythm game where you play any pitch by mirroring the notes' relative directional movement.",
                        month: 'December',
                        image: '/src/games/december/logo.webp',
                        color: '#2e0030',
                    },
                };

                return dataset[pagePath] || {};
            },
        }),
    ],
    build: {
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                jan: resolve(__dirname, 'landing/wormhole/index.html'),
                feb: resolve(__dirname, 'landing/relay/index.html'),
                mar: resolve(__dirname, 'landing/brick-bop/index.html'),
                apr: resolve(__dirname, 'landing/kornivore/index.html'),
                may: resolve(__dirname, 'landing/star-squad/index.html'),
                jun: resolve(__dirname, 'landing/snailsweeper/index.html'),
                jul: resolve(__dirname, 'landing/key-pals/index.html'),
                aug: resolve(__dirname, 'landing/cascade/index.html'),
                sep: resolve(__dirname, 'landing/drawn-together/index.html'),
                oct: resolve(__dirname, 'landing/the-beans-gambit/index.html'),
                nov: resolve(__dirname, 'landing/make-and-break/index.html'),
                dec: resolve(__dirname, 'landing/groovy-keys/index.html'),
            },
        },
    },
});
