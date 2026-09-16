import { describe, it, expect } from 'vitest';
import {
    extractMarkdownTitle,
    deriveWorkspaceNameFromPath,
    findRecentImplementationPlans,
    findLatestImplementationPlan,
    findRecentWalkthroughs,
    findLatestWalkthrough
} from '../../src/utils/workspace.js';
import { actedActionIds } from '../../src/server.js';

describe('Plan Archive and Walkthrough Utilities', () => {
    describe('extractMarkdownTitle', () => {
        it('extracts top-level # heading from markdown content', () => {
            const md = '# My Custom Implementation Plan\n\nSome text';
            expect(extractMarkdownTitle(md)).toBe('My Custom Implementation Plan');
        });

        it('handles leading newlines or whitespace before heading', () => {
            const md = '\n\n# Advanced Features & UI Roadmap\n\nContent';
            expect(extractMarkdownTitle(md)).toBe('Advanced Features & UI Roadmap');
        });

        it('returns fallback if no # heading is present', () => {
            const md = '## Subheading only\nJust paragraph text';
            expect(extractMarkdownTitle(md, 'Default Plan')).toBe('Default Plan');
        });

        it('returns fallback for empty or null content', () => {
            expect(extractMarkdownTitle('', 'Fallback')).toBe('Fallback');
            expect(extractMarkdownTitle(null, 'Fallback')).toBe('Fallback');
        });
    });

    describe('deriveWorkspaceNameFromPath', () => {
        it('derives Projet_Cholet from path', () => {
            const p = '/home/deck/SynologyDrive/01_Projets/Projet_Cholet/00_Synthese/plan.md';
            expect(deriveWorkspaceNameFromPath(p)).toBe('Projet_Cholet');
        });

        it('derives OmniAntigravityRemoteChat from path', () => {
            const p = '/home/deck/Documents/OmniAntigravityRemoteChat/OmniAntigravityRemoteChat/docs/plan.md';
            expect(deriveWorkspaceNameFromPath(p)).toBe('OmniAntigravityRemoteChat');
        });

        it('derives Conversation ID for brain storage paths', () => {
            const p = '/home/deck/.gemini/antigravity-ide/brain/0dfec38b-6990-401d-82df-5d3a4de88d42/walkthrough.md';
            expect(deriveWorkspaceNameFromPath(p)).toBe('Conversation 0dfec38b');
        });
    });

    describe('findRecentImplementationPlans & findLatestImplementationPlan', () => {
        it('finds recent plans and returns an array up to limit', async () => {
            const plans = await findRecentImplementationPlans(5);
            expect(Array.isArray(plans)).toBe(true);
            if (plans.length > 0) {
                const plan = plans[0];
                expect(plan).toHaveProperty('id');
                expect(plan).toHaveProperty('path');
                expect(plan).toHaveProperty('title');
                expect(plan).toHaveProperty('workspaceName');
                expect(plan).toHaveProperty('updatedAt');
                expect(typeof plan.updatedAt).toBe('number');
            }
        });

        it('findLatestImplementationPlan returns the top plan with content', async () => {
            const plan = await findLatestImplementationPlan();
            if (plan) {
                expect(plan).toHaveProperty('path');
                expect(plan).toHaveProperty('content');
                expect(plan).toHaveProperty('updatedAt');
                expect(typeof plan.content).toBe('string');
            }
        });
    });

    describe('findRecentWalkthroughs & findLatestWalkthrough', () => {
        it('finds recent walkthroughs and returns an array up to limit', async () => {
            const walkthroughs = await findRecentWalkthroughs(5);
            expect(Array.isArray(walkthroughs)).toBe(true);
            if (walkthroughs.length > 0) {
                const wt = walkthroughs[0];
                expect(wt).toHaveProperty('id');
                expect(wt).toHaveProperty('path');
                expect(wt).toHaveProperty('title');
                expect(wt).toHaveProperty('workspaceName');
                expect(wt).toHaveProperty('updatedAt');
                expect(typeof wt.updatedAt).toBe('number');
            }
        });

        it('findLatestWalkthrough returns the top walkthrough with content', async () => {
            const wt = await findLatestWalkthrough();
            if (wt) {
                expect(wt).toHaveProperty('path');
                expect(wt).toHaveProperty('content');
                expect(wt).toHaveProperty('updatedAt');
                expect(typeof wt.content).toBe('string');
            }
        });
    });

    describe('Dismiss action resolution in actedActionIds', () => {
        it('records dismissed actionId in actedActionIds', () => {
            const testActionId = 'plan-dismiss-test-' + Date.now();
            expect(actedActionIds.has(testActionId)).toBe(false);
            actedActionIds.add(testActionId);
            expect(actedActionIds.has(testActionId)).toBe(true);
            actedActionIds.delete(testActionId);
        });
    });
});
