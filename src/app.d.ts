import { Redis } from 'ioredis';

declare global {
    namespace App {
        interface Locals {
            redis: Redis;
        }
    }
    
    interface Window {
        kasware: any;
        solflare: any;
        ethereum: any;
    }
}

export {};