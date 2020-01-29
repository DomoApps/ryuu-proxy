import {
  Rule,
  SchematicContext,
  Tree,
  chain,
  mergeWith,
  url,
  template,
  apply
} from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import { strings } from '@angular-devkit/core';

function updateJsonFile(
  host: Tree,
  path: string,
  callback: (json: any) => void
): Tree {
  const source = host.read(path);
  if (source) {
    const sourceText = source.toString();
    const json = JSON.parse(sourceText);
    callback(json);
    host.overwrite(path, JSON.stringify(json, null, 2));
  }
  return host;
}

function addProxyToAngularJson(options: any): Rule {
  return (tree: Tree) => {
    return updateJsonFile(tree, 'angular.json', json => {
      const projectName = options.project || json.defaultProject;
      const project = json.projects[projectName];
      const opts = project.architect.serve.options;
      opts['proxyConfig'] = 'proxy.conf.json';
    });
  };
}

function addDepsToPackage(_options: any): Rule {
  return (tree: Tree) => {
    return updateJsonFile(tree, 'package.json', (json: any) => {
      json['devDependencies'] = json['devDependencies'] || {};
      const devDeps = json['devDependencies'];
      // devDeps['@domoinc/ryuu-proxy'] = '^4.0.1';
      devDeps['express'] = '^4.17.1';
      const scripts = json.scripts;

      scripts['start:proxy'] = 'node proxy.js | ng serve';
      scripts['build'] = 'ng build --prod --aot && npm run copy:domo';
      scripts['publish:domo'] =
        'npm run build && cd dist/federated-ui && domo publish';
    });
  };
}

// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export default function ngAdd(_options: any): Rule {
  return (_tree: Tree, _context: SchematicContext) => {
    _context.addTask(new NodePackageInstallTask());
    return chain([
      addProxyToAngularJson(_options),
      addDepsToPackage(_options),
      mergeWith(apply(url('./files'), [template({ ..._options, ...strings })]))
    ]);
  };
}
