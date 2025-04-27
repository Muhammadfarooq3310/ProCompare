import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: (req) => {
        console.log('Request headers:', req.headers);
        console.log('Request cookies:', req.cookies);

        const headerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
        console.log(headerToken);
        const cookieToken = req?.cookies?.token as string;
        console.log(req?.cookies);

        console.log('Found header token:', !!headerToken);
        console.log('Found cookie token:', !!cookieToken);

        if (cookieToken) {
          try {
            // Try to verify the token structure
            const parts = cookieToken.split('.');
            if (parts.length !== 3) {
              console.log('Invalid token structure');
            }
            console.log('Token parts:', parts.length);
          } catch (e) {
            console.log('Error parsing token:', e);
          }
        }

        return headerToken || cookieToken;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'default-secret',
    });
  }

  validate(payload: JwtPayload) {
    return {
      id: Number(payload.sub),
      email: payload.email,
      role: payload.role,
    };
  }
}
