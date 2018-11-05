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

import { injectable } from 'inversify';
import { getPassword, setPassword, deletePassword } from 'keytar';

/**
 * Shared access to the host system's keychain for Git:
 *  - on OS X the passwords are managed by the `Keychain`,
 *  - on Linux they are managed by the `Secret Service API`/`libsecret`, and
 *  - on Windows they are managed by `Credential Vault`.
 *
 * **Note**: There is a caveat on Linux. Since the underlying `keytar` library uses `libsecret` so you may need to install it before running npm install.
 * Depending on your distribution, you will need to run the following command:
 *  - Debian/Ubuntu: `sudo apt-get install libsecret-1-dev`.
 *  - Red Hat-based: `sudo yum install libsecret-devel`.
 *  - Arch Linux: `sudo pacman -S libsecret`.
 */
@injectable()
export class GitTokenStore {

    /**
     * Adds the password for the service and account to the keychain.
     */
    async set(serviceKey: string, account: string, password: string): Promise<void> {
        return setPassword(serviceKey, account, password);
    }

    /**
     * Resolves to the password for the service and account. `undefined` if the password cannot be retrieved.
     */
    async get(serviceKey: string, account: string): Promise<string | undefined> {
        const password = await getPassword(serviceKey, account);
        // Do not let `null` to leak into the application code.
        if (password === null) {
            return undefined;
        }
        return password;
    }

    /**
     * Deletes the stored password for the service and account.
     * As a result, it resolves to the status of the operation; `true` if it was successful. Otherwise, `false`.
     */
    async delete(key: string, login: string): Promise<boolean> {
        return deletePassword(key, login);
    }

}
