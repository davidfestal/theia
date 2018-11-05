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
// Based on: https://github.com/Microsoft/THEIA/blob/dd3e2d94f81139f9d18ba15a24c16c6061880b93/extensions/git/src/askpass-main.ts.

import * as http from 'http';
import * as fs from 'fs';

// tslint:disable-next-line:no-any
function fatal(err: any): void {
    console.error('Missing or invalid credentials.');
    console.error(err);
    process.exit(1);
}

function main(argv: string[]): void {
    if (argv.length !== 5) {
        return fatal('Wrong number of arguments');
    }

    if (!process.env['THEIA_GIT_ASKPASS_HANDLE']) {
        return fatal('Missing handle');
    }

    if (!process.env['THEIA_GIT_ASKPASS_PIPE']) {
        return fatal('Missing pipe');
    }

    if (process.env['THEIA_GIT_COMMAND'] === 'fetch') {
        return fatal('Skip fetch commands');
    }

    const output = process.env['THEIA_GIT_ASKPASS_PIPE'] as string;
    const socketPath = process.env['THEIA_GIT_ASKPASS_HANDLE'] as string;
    const request = argv[2];
    const host = argv[4].substring(1, argv[4].length - 2);
    const opts: http.RequestOptions = {
        socketPath,
        path: '/',
        method: 'POST'
    };

    const req = http.request(opts, res => {
        if (res.statusCode !== 200) {
            return fatal(`Bad status code: ${res.statusCode}`);
        }

        const chunks: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (d: string) => chunks.push(d));
        res.on('end', () => {
            const raw = chunks.join('');

            try {
                const result = JSON.parse(raw);
                fs.writeFileSync(output, result + '\n');
            } catch (err) {
                return fatal('Error parsing response');
            }

            setTimeout(() => process.exit(0), 0);
        });
    });

    req.on('error', () => fatal('Error in request'));
    req.write(JSON.stringify({ request, host }));
    req.end();
}

main(process.argv);
