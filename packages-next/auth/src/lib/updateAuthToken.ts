import { AuthTokenRequestErrorCode } from '../types';
import { generateToken } from './generateToken';

// TODO: Auth token mutations may leak user identities due to timing attacks :(
// We don't (currently) make any effort to mitigate the time taken to record the new token or sent the email when successful
export async function updateAuthToken(
  tokenType: 'passwordReset' | 'magicAuth',
  list: any,
  identityField: string,
  protectIdentities: boolean,
  identity: string,
  ctx: any
): Promise<
  | {
      success: false;
      code?: AuthTokenRequestErrorCode;
    }
  | {
      success: true;
      itemId: string | number;
      token: string;
    }
> {
  const items = await list.adapter.find({ [identityField]: identity });

  // Identity failures with helpful errors (unless it would violate our protectIdentities config)
  let specificCode: AuthTokenRequestErrorCode | undefined;
  if (items.length === 0) {
    specificCode = 'IDENTITY_NOT_FOUND';
  } else if (items.length > 1) {
    specificCode = 'MULTIPLE_IDENTITY_MATCHES';
  }
  if (specificCode !== undefined) {
    // There is no generic `AUTH_TOKEN_REQUEST_FAILURE` code; it's existance would alow values in the identity field to be probed
    return { success: false, code: protectIdentities ? undefined : specificCode };
  }

  const item = items[0];
  const token = generateToken(20);

  // Save the token and related info back to the item
  const { errors } = await ctx.keystone.executeGraphQL({
    context: ctx.keystone.createContext({ skipAccessControl: true }),
    query: `mutation($id: String, $token: String, $now: String) {
      ${list.gqlNames.updateMutationName}(id: $id, data: {
        ${tokenType}Token: $token,
        ${tokenType}IssuedAt: $now,
        ${tokenType}RedeemedAt: null
      }) { id }
    }`,
    variables: { id: item.id, token, now: new Date().toISOString() },
  });
  if (Array.isArray(errors) && errors.length > 0) {
    throw errors[0];
  }

  return { success: true, itemId: item.id, token };
}
