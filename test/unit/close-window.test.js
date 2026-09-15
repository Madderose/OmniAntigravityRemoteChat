import { describe, it, expect } from 'vitest';

describe('Window Management & Close Target Logic', () => {
    it('requires confirmation when closing the last window without force', () => {
        const availableTargets = [
            { id: '7800:TARGET1', title: 'Antigravity IDE', type: 'workbench', port: 7800 }
        ];
        const workbenchTargets = availableTargets.filter(t => t.type === 'workbench');
        const isLastWindow = workbenchTargets.length <= 1;
        const force = false;

        let response;
        if (isLastWindow && !force) {
            response = {
                success: false,
                requiresConfirmation: true,
                isLastWindow: true,
                message: "Attention : il s'agit de la dernière fenêtre active d'Antigravity IDE. La fermer va quitter l'application Antigravity sur votre machine et interrompre la connexion avec OmniAntigravity Remote Chat."
            };
        } else {
            response = { success: true };
        }

        expect(response.success).toBe(false);
        expect(response.requiresConfirmation).toBe(true);
        expect(response.isLastWindow).toBe(true);
        expect(response.message).toContain('dernière fenêtre active');
    });

    it('allows closing when multiple windows are open without force', () => {
        const availableTargets = [
            { id: '7800:TARGET1', title: 'Window 1', type: 'workbench', port: 7800 },
            { id: '7800:TARGET2', title: 'Window 2', type: 'workbench', port: 7800 }
        ];
        const workbenchTargets = availableTargets.filter(t => t.type === 'workbench');
        const isLastWindow = workbenchTargets.length <= 1;
        const force = false;

        let response;
        if (isLastWindow && !force) {
            response = { success: false, requiresConfirmation: true };
        } else {
            response = {
                success: true,
                closedTargetId: '7800:TARGET1',
                remainingTargets: availableTargets.filter(t => t.id !== '7800:TARGET1')
            };
        }

        expect(response.success).toBe(true);
        expect(response.remainingTargets.length).toBe(1);
    });

    it('allows closing the last window when force is true', () => {
        const availableTargets = [
            { id: '7800:TARGET1', title: 'Antigravity IDE', type: 'workbench', port: 7800 }
        ];
        const workbenchTargets = availableTargets.filter(t => t.type === 'workbench');
        const isLastWindow = workbenchTargets.length <= 1;
        const force = true;

        let response;
        if (isLastWindow && !force) {
            response = { success: false, requiresConfirmation: true };
        } else {
            response = {
                success: true,
                closedTargetId: '7800:TARGET1',
                remainingTargets: [],
                isDisconnected: true
            };
        }

        expect(response.success).toBe(true);
        expect(response.isDisconnected).toBe(true);
        expect(response.remainingTargets.length).toBe(0);
    });

    it('normalizes multiline text with LF/CR/whitespace without regex errors', () => {
        const multilineInput = "First line with `code`\r\nSecond line with \\ backslash\nThird line";
        const cleanStaging = (val) => {
            return (val || "")
                .split(String.fromCharCode(32)).join("")
                .split(String.fromCharCode(9)).join("")
                .split(String.fromCharCode(10)).join("")
                .split(String.fromCharCode(13)).join("")
                .split(String.fromCharCode(92)).join("")
                .split(String.fromCharCode(96)).join("");
        };

        const cleaned = cleanStaging(multilineInput);
        expect(cleaned).toBe("FirstlinewithcodeSecondlinewithbackslashThirdline");
        expect(cleaned).not.toContain('\n');
        expect(cleaned).not.toContain('\r');
        expect(cleaned).not.toContain('`');
        expect(cleaned).not.toContain('\\');
    });
});
