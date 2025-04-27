declare module '@nestjs/config' {
  export class ConfigModule {
    static forRoot(options?: any): any;
  }

  export class ConfigService {
    get<T>(propertyPath: string): T | undefined;
    get<T>(propertyPath: string, defaultValue: T): T;
  }
}
