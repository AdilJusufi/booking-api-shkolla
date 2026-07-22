using System.Security.Cryptography;
using System.Text;

namespace Booking.Infrastructure.Auth;

/// <summary>Refresh token-at ruhen vetëm si SHA-256 hash — vjedhja e databazës nuk jep token të përdorshëm.</summary>
public static class TokenHasher
{
    public static string Sha256(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes);
    }
}
