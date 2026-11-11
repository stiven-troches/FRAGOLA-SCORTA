import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server.mjs';

test('primera cuenta exige administrador sin bloquear creación posterior de operadores', () => {
  const directory=mkdtempSync(join(tmpdir(),'scorta-bootstrap-'));
  const store=openStore(join(directory,'db.sqlite'));
  try {
    assert.throws(()=>store.addUser('cajero','UnaContraseñaSegura123','operador'), /primera cuenta.*administradora/);
    assert.deepEqual(store.listUsers(),[]);
    store.addUser('admin','UnaContraseñaSegura123','admin');
    assert.equal(store.verifyUser('admin','UnaContraseñaSegura123').role,'admin');
    store.addUser('cajero','OtraContraseñaSegura123','operador');
    assert.equal(store.verifyUser('cajero','OtraContraseñaSegura123').role,'operador');
    assert.equal(store.listUsers().length,2);
  } finally {store.close();rmSync(directory,{recursive:true,force:true});}
});
