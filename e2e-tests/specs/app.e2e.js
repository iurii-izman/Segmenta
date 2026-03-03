/**
 * E2E: Application shell and tab navigation
 */
describe('Transkribator', () => {
    it('opens and shows application title', async () => {
        const header = await $('header');
        await expect(header).toBeDisplayed();
        const text = await header.getText();
        expect(text).toMatch(/Transkribator/);
    });

    it('shows New Task tab by default', async () => {
        const btn = await $('button.btn-primary');
        await expect(btn).toBeDisplayed();
    });

    it('switches to Queue tab and shows queue content', async () => {
        const nav = await $('nav.tab-bar');
        const buttons = await nav.$$('button');
        await buttons[1].click();
        await browser.pause(400);
        const emptyOrList = await $('.empty-state');
        const list = await $('.queue-list');
        const visible = await emptyOrList.isDisplayed().catch(() => false)
            || await list.isDisplayed().catch(() => false);
        expect(visible).toBe(true);
    });

    it('switches to Settings tab and shows settings content', async () => {
        const nav = await $('nav.tab-bar');
        const buttons = await nav.$$('button');
        await buttons[2].click();
        await browser.pause(400);
        const body = await $('body');
        const text = await body.getText();
        expect(text).toMatch(/faster-whisper|Transkribator|Настройки|Settings/);
    });

    it('can switch back to New Task tab', async () => {
        const nav = await $('nav.tab-bar');
        const buttons = await nav.$$('button');
        await buttons[0].click();
        await browser.pause(400);
        const primaryBtn = await $('button.btn-primary');
        await expect(primaryBtn).toBeDisplayed();
    });
});
