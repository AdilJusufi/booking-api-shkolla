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

/// <summary>Kredenciale të pavlefshme, token i skaduar/revokuar → HTTP 401.</summary>
public sealed class AuthenticationFailedException : Exception
{
    public AuthenticationFailedException(string message = "Kredencialet janë të pavlefshme.") : base(message)
    {
    }
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
