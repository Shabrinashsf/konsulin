// Runs the @nestjs/swagger CLI plugin under ts-jest with the options from
// nest-cli.json, so e2e tests see the same OpenAPI document as `nest build`.
const plugin = require('@nestjs/swagger/plugin');
const { compilerOptions } = require('../nest-cli.json');

const { options } = compilerOptions.plugins.find(
    (p) => p.name === '@nestjs/swagger',
);

module.exports = {
    name: 'nestjs-swagger-plugin',
    version: 1,
    factory: (cs) => plugin.before(options, cs.program),
};
