namespace Booking.Application.Common.Exceptions;

/// <summary>Resursi nuk ekziston → HTTP 404.</summary>
public sealed class NotFoundException : Exception
{
    public NotFoundException(string entityName, object key)
        : base($"{entityName} me identifikues '{key}' nuk u gjet.")
    {
    }

    public NotFoundException(string message) : base(message)
    {
    }
}

/// <summary>Përdoruesi është i kyçur por s'ka të drejtë mbi këtë resurs → HTTP 403.</summary>
public sealed class ForbiddenAccessException : Exception
{
    public ForbiddenAccessException(string message = "Nuk keni qasje në këtë resurs.") : base(message)
    {
    }
}

/// <summary>
/// Kredenciale të pavlefshme, token i skaduar/revokuar → HTTP 401 (ose 403 për llogari të çaktivizuar).
/// <para>
/// <see cref="ErrorCode"/> është kontratë me frontend-in: teksti i <see cref="Exception.Message"/>
/// mbetet për log/debug, ndërsa klienti klasifikon gabimin sipas kodit.
/// </para>
/// </summary>
public sealed class AuthenticationFailedException : Exception
{
    /// <summary>Kod i lexueshëm nga makina, i ekspozuar në ProblemDetails (`type` dhe `code`).</summary>
    public string ErrorCode { get; }

    /// <summary>HTTP status i kësaj dështese — 401 gjithmonë, përveç llogarisë së çaktivizuar (403).</summary>
    public int StatusCode { get; }

    public AuthenticationFailedException(string message = "Kredencialet janë të pavlefshme.")
        : this(AuthErrorCodes.InvalidCredentials, message)
    {
    }

    public AuthenticationFailedException(string errorCode, string message, int statusCode = 401) : base(message)
    {
        ErrorCode = errorCode;
        StatusCode = statusCode;
    }

    /// <summary>Email ose password i gabuar → 401.</summary>
    public static AuthenticationFailedException InvalidCredentials() => new();

    /// <summary>Llogaria e bllokuar përkohësisht nga tentimet e dështuara → 401.</summary>
    public static AuthenticationFailedException AccountLocked() => new(
        AuthErrorCodes.AccountLocked,
        "Llogaria është bllokuar përkohësisht nga tentimet e dështuara. Provo më vonë.");

    /// <summary>Email-i nuk është konfirmuar ende → 401.</summary>
    public static AuthenticationFailedException EmailNotConfirmed() => new(
        AuthErrorCodes.EmailNotConfirmed,
        "Email-i nuk është konfirmuar ende. Kontrollo postën tënde.");

    /// <summary>Llogaria është çaktivizuar nga administratori → 403 (kredencialet janë të sakta).</summary>
    public static AuthenticationFailedException AccountDeactivated() => new(
        AuthErrorCodes.AccountDeactivated,
        "Llogaria juaj është çaktivizuar. Kontaktoni mbështetjen.",
        statusCode: 403);
}

/// <summary>Kodet e gabimeve të autentifikimit — kontratë e qëndrueshme me klientët.</summary>
public static class AuthErrorCodes
{
    public const string InvalidCredentials = "invalid_credentials";
    public const string AccountLocked = "account_locked";
    public const string EmailNotConfirmed = "email_not_confirmed";
    public const string AccountDeactivated = "account_deactivated";
    public const string InvalidRefreshToken = "invalid_refresh_token";
    public const string InvalidResetToken = "invalid_reset_token";
    public const string InvalidConfirmationToken = "invalid_confirmation_token";
}

/// <summary>Konflikt gjendjeje (p.sh. slot i zënë, email ekzistues) → HTTP 409.</summary>
public sealed class ConflictException : Exception
{
    public string ErrorCode { get; }

    public ConflictException(string errorCode, string message) : base(message)
    {
        ErrorCode = errorCode;
    }
}
