using System.Reflection;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Startup;

/// <summary>
/// FluentValidationFilter dështon "i hapur": nëse për një argument nuk gjendet
/// IValidator&lt;T&gt;, ai thjesht bën `continue` dhe kërkesa kalon pa u validuar fare.
/// Kjo është sjellja e duhur për argumentet që s'janë payload (Guid, CancellationToken),
/// por do të thotë gjithashtu se një DTO i ri i shtuar pa validator nuk sinjalizon asgjë —
/// nuk ka gabim, nuk ka log, thjesht një endpoint që pranon çfarëdo hyrjeje.
///
/// Ky skanim e kthen atë heshtje në një dështim. Ekzekutohet një herë në nisje.
/// </summary>
public static class ValidatorCoverage
{
    /// <summary>
    /// Kthen çdo tip payload-i të lidhur nga një action i kontrollerit që s'ka
    /// IValidator&lt;T&gt; të regjistruar.
    /// </summary>
    public static IReadOnlyList<Type> FindUnvalidatedPayloadTypes(
        IServiceProvider services, Assembly controllerAssembly, Assembly contractAssembly)
    {
        var missing = new HashSet<Type>();

        // Validator-ët regjistrohen si Scoped (AddValidatorsFromAssembly). Zgjidhja e tyre
        // drejtpërdrejt nga root provider-i hedh përjashtim kur validimi i scope-ve është
        // aktiv (Development), pra kontrolli do të rrëzohej për arsyen e gabuar — dhe në
        // prodhim, ku ai validim është i fikur, do të sillej ndryshe. Një scope i vetëm i
        // përkohshëm e bën kërkimin identik në të dyja mjediset.
        using var scope = services.CreateScope();
        var scopedServices = scope.ServiceProvider;

        var controllers = controllerAssembly
            .GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract);

        foreach (var controller in controllers)
        {
            var actions = controller
                .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(m => !m.IsSpecialName);

            foreach (var parameter in actions.SelectMany(a => a.GetParameters()))
            {
                var type = parameter.ParameterType;

                // Vetëm kontratat tona hyjnë në llogari. Guid/CancellationToken/tipat e
                // framework-ut s'kanë as pse të kenë validator, dhe përfshirja e tyre do ta
                // bënte kontrollin zhurmë që dikush do ta fikte.
                if (type.Assembly != contractAssembly)
                {
                    continue;
                }

                if (scopedServices.GetService(typeof(IValidator<>).MakeGenericType(type)) is null)
                {
                    missing.Add(type);
                }
            }
        }

        return missing.OrderBy(t => t.Name).ToList();
    }
}
