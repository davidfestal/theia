/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Based on: https://github.com/Microsoft/THEIA/blob/dd3e2d94f81139f9d18ba15a24c16c6061880b93/extensions/git/src/askpass.ts

import { injectable, postConstruct, inject } from 'inversify';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as crypto from 'crypto';
import { ILogger } from '@theia/core/lib/common/logger';
import { isWindows } from '@theia/core/lib/common/os';
import { Disposable } from '@theia/core/lib/common/disposable';
import { MaybePromise } from '@theia/core/lib/common/types';
import { DugiteGitPromptServer } from '../../node/dugite-git-prompt';
import { GitPrompt } from '../../common/git-prompt';

export interface AskpassEnvironment {
    readonly GIT_ASKPASS: string;
    readonly ELECTRON_RUN_AS_NODE?: string;
    readonly THEIA_GIT_ASKPASS_NODE?: string;
    readonly THEIA_GIT_ASKPASS_MAIN?: string;
    readonly THEIA_GIT_ASKPASS_HANDLE?: string;
}

@injectable()
export class Askpass implements Disposable {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(DugiteGitPromptServer)
    protected readonly promptServer: DugiteGitPromptServer;

    protected server: http.Server;
    protected ipcHandlePathPromise: Promise<string>;
    protected ipcHandlePath: string | undefined;
    protected enabled = true;

    @postConstruct()
    protected init(): void {
        this.server = http.createServer((req, res) => this.onRequest(req, res));
        this.ipcHandlePathPromise = this.setup().catch(err => {
            this.logger.error(err);
            return '';
        });
    }

    protected async setup(): Promise<string> {
        const buffer = await this.randomBytes(20);
        const nonce = buffer.toString('hex');
        const ipcHandlePath = this.getIPCHandlePath(nonce);
        this.ipcHandlePath = ipcHandlePath;

        try {
            this.server.listen(ipcHandlePath);
            this.server.on('error', err => this.logger.error(err));
        } catch (err) {
            this.logger.error('Could not launch git askpass helper.', err);
            this.enabled = false;
        }

        return ipcHandlePath;
    }

    protected getIPCHandlePath(nonce: string): string {
        const fileName = `theia-git-askpass-${nonce}-sock`;
        if (isWindows) {
            return `\\\\.\\pipe\\${fileName}`;
        }

        if (process.env['XDG_RUNTIME_DIR']) {
            return path.join(process.env['XDG_RUNTIME_DIR'] as string, fileName);
        }

        return path.join(os.tmpdir(), fileName);
    }

    protected onRequest(req: http.ServerRequest, res: http.ServerResponse): void {
        const chunks: string[] = [];
        req.setEncoding('utf8');
        req.on('data', (d: string) => chunks.push(d));
        req.on('end', () => {
            const { request, host } = JSON.parse(chunks.join(''));

            this.prompt(host, request).then(result => {
                res.writeHead(200);
                res.end(JSON.stringify(result));
            }, () => {
                res.writeHead(500);
                res.end();
            });
        });
    }

    protected async prompt(host: string, request: string): Promise<string> {
        try {
            const answer = await this.promptServer.ask({
                password: /password/i.test(request),
                text: request,
                details: `Git: ${host} (Press 'Enter' to confirm or 'Escape' to cancel.)`
            });
            if (GitPrompt.Success.is(answer) && typeof answer.result === 'string') {
                return answer.result;
            } else if (GitPrompt.Cancel.is(answer)) {
                return '';
            } else if (GitPrompt.Failure.is(answer)) {
                const { error } = answer;
                throw error;
            }
            throw new Error('Unexpected answer.'); // Do not ever print the answer, it might contain the password.
        } catch (e) {
            this.logger.error(`An unexpected error occurred when requesting ${request} by ${host}.`, e);
            return '';
        }
    }

    protected async randomBytes(size: number): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            crypto.randomBytes(size, (error: Error, buffer: Buffer) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(buffer);
            });
        });
    }

    async getEnv(): Promise<AskpassEnvironment> {
        if (!this.enabled) {
            return {
                GIT_ASKPASS: path.join(__dirname, '..', '..', '..', 'src', 'electron-node', 'askpass', 'askpass-empty.sh')
            };
        }

        const [
            ELECTRON_RUN_AS_NODE,
            GIT_ASKPASS,
            THEIA_GIT_ASKPASS_NODE,
            THEIA_GIT_ASKPASS_MAIN,
            THEIA_GIT_ASKPASS_HANDLE
        ] = await Promise.all([
            this.ELECTRON_RUN_AS_NODE,
            this.GIT_ASKPASS,
            this.THEIA_GIT_ASKPASS_NODE,
            this.THEIA_GIT_ASKPASS_MAIN,
            this.THEIA_GIT_ASKPASS_HANDLE
        ]);

        return {
            ELECTRON_RUN_AS_NODE,
            GIT_ASKPASS,
            THEIA_GIT_ASKPASS_NODE,
            THEIA_GIT_ASKPASS_MAIN,
            THEIA_GIT_ASKPASS_HANDLE
        };
    }

    dispose(): void {
        this.server.close();
        if (this.ipcHandlePath && !isWindows) {
            fs.unlinkSync(this.ipcHandlePath);
        }
    }

    protected get GIT_ASKPASS(): MaybePromise<string> {
        return path.join(__dirname, '..', '..', '..', 'src', 'electron-node', 'askpass', 'askpass.sh');
    }

    protected get ELECTRON_RUN_AS_NODE(): MaybePromise<string | undefined> {
        return '1';
    }

    protected get THEIA_GIT_ASKPASS_NODE(): MaybePromise<string | undefined> {
        return process.execPath;
    }

    protected get THEIA_GIT_ASKPASS_MAIN(): MaybePromise<string | undefined> {
        return path.join(__dirname, 'askpass-main.js');
    }

    protected get THEIA_GIT_ASKPASS_HANDLE(): MaybePromise<string | undefined> {
        return this.ipcHandlePathPromise;
    }

}
