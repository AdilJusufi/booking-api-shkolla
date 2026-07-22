using FluentValidation;

namespace Booking.Application.Features.Auth;

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .Matches(@"^\+?[0-9][0-9 \-]{5,19}$")
            .WithMessage("Numri i telefonit duhet të përmbajë 6–20 shifra, opsionalisht me prefiks +.");
        RuleFor(x => x.Password).ValidPassword();
        RuleFor(x => x.DateOfBirth)
            .Must(dob => dob < DateOnly.FromDateTime(DateTime.UtcNow))
            .WithMessage("Data e lindjes duhet të jetë në të kaluarën.")
            .Must(dob => dob > DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-120))
            .WithMessage("Data e lindjes nuk është e besueshme.");
        RuleFor(x => x.Gender).IsInEnum();
        RuleFor(x => x.Address).MaximumLength(300);
        RuleFor(x => x.City).MaximumLength(100);
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty();
    }
}

public sealed class RefreshTokenRequestValidator : AbstractValidator<RefreshTokenRequest>
{
    public RefreshTokenRequestValidator()
    {
        RuleFor(x => x.RefreshToken).NotEmpty();
    }
}

public sealed class RevokeTokenRequestValidator : AbstractValidator<RevokeTokenRequest>
{
    public RevokeTokenRequestValidator()
    {
        RuleFor(x => x.RefreshToken).NotEmpty();
    }
}

public sealed class ForgotPasswordRequestValidator : AbstractValidator<ForgotPasswordRequest>
{
    public ForgotPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Token).NotEmpty();
        RuleFor(x => x.NewPassword).ValidPassword();
    }
}

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword).ValidPassword();
    }
}

public sealed class ConfirmEmailRequestValidator : AbstractValidator<ConfirmEmailRequest>
{
    public ConfirmEmailRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Token).NotEmpty();
    }
}

/// <summary>Rregullat e password-it në një vend — pasqyrojnë policy-n e Identity.</summary>
public static class PasswordRuleExtensions
{
    public static IRuleBuilderOptions<T, string> ValidPassword<T>(this IRuleBuilder<T, string> ruleBuilder) =>
        ruleBuilder
            .NotEmpty()
            .MinimumLength(8).WithMessage("Password-i duhet të ketë së paku 8 karaktere.")
            .Matches("[A-Z]").WithMessage("Password-i duhet të përmbajë së paku një shkronjë të madhe.")
            .Matches("[a-z]").WithMessage("Password-i duhet të përmbajë së paku një shkronjë të vogël.")
            .Matches("[0-9]").WithMessage("Password-i duhet të përmbajë së paku një shifër.");
}
