namespace Booking.Domain.Exceptions;

/// <summary>Shkelje e një rregulli të domain-it. ErrorCode përdoret në ProblemDetails.type.</summary>
public class DomainException : Exception
{
    public string ErrorCode { get; }

    public DomainException(string errorCode, string message) : base(message)
    {
        ErrorCode = errorCode;
    }
}

/// <summary>Shkelje e rregullave të rezervimit (orar, mbivendosje, afate anulimi etj.).</summary>
public sealed class BookingRuleException : DomainException
{
    public BookingRuleException(string errorCode, string message) : base(errorCode, message)
    {
    }
}
