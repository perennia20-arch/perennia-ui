import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Hydrate from localStorage so you don't go blind when you refresh at 2 AM
const initialBrightness = browser && localStorage.getItem('perennia_ui_brightness') 
    ? parseFloat(localStorage.getItem('perennia_ui_brightness') as string) 
    : 1.0;

export const showSettingsModal = writable<boolean>(false);
export const uiBrightness = writable<number>(initialBrightness);

// Auto-save to localStorage whenever it changes
if (browser) {
    uiBrightness.subscribe(val => {
        localStorage.setItem('perennia_ui_brightness', val.toString());
    });
}