export default class ServerListProvider {

    static provider: () => Promise<typeof import("*.vue")>;

    static provide(provider: () => Promise<typeof import("*.vue")>): void {
        this.provider = provider;
    }


}
